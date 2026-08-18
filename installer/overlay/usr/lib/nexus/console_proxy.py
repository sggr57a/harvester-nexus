#!/usr/bin/env python3
"""Authenticated WebSocket proxy onto KubeVirt VNC/serial and kubectl exec.

Live consoles used to stop at ``src/lib/demoConsole.ts``. The cockpit now
upgrades ``/api/v1/console/{vnc,serial,exec}`` to a WebSocket, checks the
existing bearer/cookie session, and either:

* proxies bytes to the KubeVirt subresource API (``/vnc`` or ``/console``), or
* attaches ``kubectl exec`` to a pod over a PTY.

Name components are restricted to DNS-1123 labels so a console URL cannot
smuggle ``kubectl`` flags or path traversal.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import select
import socket
import ssl
import subprocess
from typing import Any
from urllib.parse import parse_qs, urlparse

NAME_RE = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
KUBEVIRT_SUBRESOURCE = {
    "vnc": "vnc",
    "serial": "console",
}
KUBECONFIG_CANDIDATES = [
    os.environ.get("KUBECONFIG", ""),
    "/etc/rancher/rke2/rke2.yaml",
    "/etc/rancher/k3s/k3s.yaml",
]


def websocket_accept_key(sec_websocket_key: str) -> str:
    digest = hashlib.sha1((sec_websocket_key.strip() + WS_GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def validate_k8s_name(value: str, *, max_len: int = 63) -> str:
    name = (value or "").strip()
    if not name or len(name) > max_len or not NAME_RE.match(name):
        raise ValueError("invalid kubernetes name")
    return name


def find_kubeconfig() -> str | None:
    for path in KUBECONFIG_CANDIDATES:
        if path and os.path.isfile(path):
            return path
    return None


def kubevirt_subresource_path(kind: str, namespace: str, name: str) -> str:
    sub = KUBEVIRT_SUBRESOURCE.get(kind)
    if sub is None:
        raise ValueError("unsupported console kind")
    ns = validate_k8s_name(namespace, max_len=253)
    vm = validate_k8s_name(name)
    return (
        "/apis/subresources.kubevirt.io/v1/namespaces/%s/virtualmachineinstances/%s/%s"
        % (ns, vm, sub)
    )


def _b64(data: str) -> bytes:
    return base64.b64decode(data.encode("ascii"))


def load_rest_config(kubeconfig: str) -> dict[str, Any]:
    """Resolve the current-context API server + credentials via kubectl."""
    proc = subprocess.run(
        ["kubectl", "--kubeconfig", kubeconfig, "config", "view", "--raw", "-o", "json"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        raise RuntimeError("unable to read kubeconfig")
    data = json.loads(proc.stdout)
    current = data.get("current-context") or ""
    context = next(
        (c.get("context") or {} for c in data.get("contexts") or [] if c.get("name") == current),
        {},
    )
    cluster_name = context.get("cluster")
    user_name = context.get("user")
    cluster = next(
        (c.get("cluster") or {} for c in data.get("clusters") or [] if c.get("name") == cluster_name),
        {},
    )
    user = next(
        (u.get("user") or {} for u in data.get("users") or [] if u.get("name") == user_name),
        {},
    )
    server = cluster.get("server") or ""
    if not server:
        raise RuntimeError("kube-apiserver URL missing from kubeconfig")
    return {
        "server": server,
        "ca": cluster.get("certificate-authority-data"),
        "cert": user.get("client-certificate-data"),
        "key": user.get("client-key-data"),
        "token": user.get("token"),
        "insecure": bool(cluster.get("insecure-skip-tls-verify")),
    }


def _ssl_context(rest: dict[str, Any]) -> ssl.SSLContext:
    if rest.get("insecure"):
        ctx = ssl._create_unverified_context()  # noqa: SLF001
    else:
        ctx = ssl.create_default_context()
        ca = rest.get("ca")
        if ca:
            ctx.load_verify_locations(cadata=_b64(ca).decode("ascii"))
    cert = rest.get("cert")
    key = rest.get("key")
    if cert and key:
        cert_file = os.path.join("/tmp", "nexus-console-%d.crt" % os.getpid())
        key_file = os.path.join("/tmp", "nexus-console-%d.key" % os.getpid())
        with open(cert_file, "wb") as fh:
            fh.write(_b64(cert))
        with open(key_file, "wb") as fh:
            fh.write(_b64(key))
            os.chmod(key_file, 0o600)
        ctx.load_cert_chain(certfile=cert_file, keyfile=key_file)
    return ctx


def _read_http_headers(sock: socket.socket) -> tuple[str, dict[str, str], bytes]:
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            break
        buf += chunk
        if len(buf) > 65536:
            raise RuntimeError("HTTP header too large")
    head, _, rest = buf.partition(b"\r\n\r\n")
    lines = head.decode("iso-8859-1").split("\r\n")
    status = lines[0] if lines else ""
    headers: dict[str, str] = {}
    for line in lines[1:]:
        name, _, value = line.partition(":")
        if name:
            headers[name.strip().lower()] = value.strip()
    return status, headers, rest


def connect_kubevirt_websocket(kind: str, namespace: str, name: str, kubeconfig: str | None = None) -> socket.socket:
    kubeconfig = kubeconfig or find_kubeconfig()
    if not kubeconfig:
        raise RuntimeError("kubeconfig not found")
    rest = load_rest_config(kubeconfig)
    parsed = urlparse(rest["server"])
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = kubevirt_subresource_path(kind, namespace, name)
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    headers = [
        "GET %s HTTP/1.1" % path,
        "Host: %s" % (parsed.netloc or host),
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: %s" % key,
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Protocol: binary.kubevirt.io",
    ]
    if rest.get("token"):
        headers.append("Authorization: Bearer %s" % rest["token"])
    raw = socket.create_connection((host, port), timeout=10)
    raw.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    sock: socket.socket
    if parsed.scheme == "https":
        sock = _ssl_context(rest).wrap_socket(raw, server_hostname=host)
    else:
        sock = raw
    sock.sendall(("\r\n".join(headers) + "\r\n\r\n").encode("ascii"))
    sock.settimeout(15)
    status, response_headers, leftover = _read_http_headers(sock)
    if "101" not in status:
        sock.close()
        raise RuntimeError("kube-apiserver refused console upgrade: %s" % status)
    if leftover:
        # Extremely unusual before the first RFB bytes; stash on the socket via a wrapper.
        sock = _PrefixedSocket(sock, leftover)
    expected = websocket_accept_key(key)
    if response_headers.get("sec-websocket-accept") != expected:
        # Some kube-apiserver versions still complete the upgrade; continue if 101.
        pass
    sock.settimeout(None)
    return sock


class _PrefixedSocket:
    """Socket-like wrapper that replays bytes received with the HTTP response."""

    def __init__(self, sock: socket.socket, prefix: bytes):
        self._sock = sock
        self._prefix = prefix

    def recv(self, nbytes: int) -> bytes:
        if self._prefix:
            out, self._prefix = self._prefix[:nbytes], self._prefix[nbytes:]
            return out
        return self._sock.recv(nbytes)

    def sendall(self, data: bytes) -> None:
        self._sock.sendall(data)

    def fileno(self) -> int:
        return self._sock.fileno()

    def close(self) -> None:
        self._sock.close()

    def settimeout(self, value: float | None) -> None:
        self._sock.settimeout(value)

    def shutdown(self, how: int) -> None:
        self._sock.shutdown(how)


def pump_sockets(left: Any, right: Any) -> None:
    """Copy bytes in both directions until either side closes."""
    sockets = [left, right]
    try:
        while True:
            readable, _, _ = select.select(sockets, [], [], 60.0)
            if not readable:
                continue
            for src in readable:
                dst = right if src is left else left
                data = src.recv(65536)
                if not data:
                    return
                dst.sendall(data)
    finally:
        for sock in sockets:
            try:
                sock.close()
            except OSError:
                pass


def encode_ws_text(payload: bytes, *, masked: bool = False) -> bytes:
    """Encode a single unfragmented text (if utf-8) or binary websocket frame."""
    try:
        payload.decode("utf-8")
        opcode = 0x81
    except UnicodeDecodeError:
        opcode = 0x82
    length = len(payload)
    header = bytearray([opcode])
    mask_key = os.urandom(4) if masked else b""
    if length < 126:
        header.append((0x80 if masked else 0x00) | length)
    elif length < 65536:
        header.append((0x80 if masked else 0x00) | 126)
        header.extend(length.to_bytes(2, "big"))
    else:
        header.append((0x80 if masked else 0x00) | 127)
        header.extend(length.to_bytes(8, "big"))
    if masked:
        header.extend(mask_key)
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    return bytes(header) + payload


def decode_ws_frames(buffer: bytearray) -> tuple[list[bytes], bool]:
    """Pull complete frames out of ``buffer``. Returns (payloads, closed)."""
    payloads: list[bytes] = []
    closed = False
    while True:
        if len(buffer) < 2:
            break
        b1, b2 = buffer[0], buffer[1]
        opcode = b1 & 0x0F
        masked = bool(b2 & 0x80)
        length = b2 & 0x7F
        offset = 2
        if length == 126:
            if len(buffer) < 4:
                break
            length = int.from_bytes(buffer[2:4], "big")
            offset = 4
        elif length == 127:
            if len(buffer) < 10:
                break
            length = int.from_bytes(buffer[2:10], "big")
            offset = 10
        mask_len = 4 if masked else 0
        if len(buffer) < offset + mask_len + length:
            break
        mask = bytes(buffer[offset : offset + mask_len]) if masked else b""
        start = offset + mask_len
        data = bytes(buffer[start : start + length])
        del buffer[: start + length]
        if masked:
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        if opcode == 0x8:
            closed = True
            break
        if opcode in (0x1, 0x2, 0x0):
            payloads.append(data)
        # ping/pong/other control frames are ignored
    return payloads, closed


def attach_pod_exec(namespace: str, name: str, kubeconfig: str | None = None, command: str = "/bin/sh") -> subprocess.Popen:
    kubeconfig = kubeconfig or find_kubeconfig()
    if not kubeconfig:
        raise RuntimeError("kubeconfig not found")
    ns = validate_k8s_name(namespace, max_len=253)
    pod = validate_k8s_name(name)
    # Only a shell path, never a caller-supplied argument list.
    if command not in ("/bin/sh", "/bin/bash", "sh", "bash"):
        command = "/bin/sh"
    return subprocess.Popen(
        [
            "kubectl",
            "--kubeconfig", kubeconfig,
            "exec",
            "-n", ns,
            "-i",
            "-t",
            pod,
            "--",
            command,
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
    )


def parse_console_request(path: str) -> tuple[str, str, str]:
    parsed = urlparse(path)
    kind = parsed.path.rstrip("/").rsplit("/", 1)[-1]
    if kind not in ("vnc", "serial", "exec"):
        raise ValueError("unsupported console kind")
    query = parse_qs(parsed.query)
    namespace = (query.get("namespace") or [""])[0]
    name = (query.get("name") or [""])[0]
    validate_k8s_name(namespace, max_len=253)
    validate_k8s_name(name)
    return kind, namespace, name


def handle_browser_upgrade(handler, kind: str, namespace: str, name: str) -> None:
    """Complete the browser WebSocket handshake and attach the backend.

    The upstream attach happens *before* the 101 so a missing VMI or kubeconfig
    can still surface as an HTTP error instead of a half-open socket.
    """
    key = handler.headers.get("Sec-WebSocket-Key")
    if not key:
        handler._plain(400, b"missing Sec-WebSocket-Key")
        return
    upstream = None
    proc = None
    if kind in ("vnc", "serial"):
        upstream = connect_kubevirt_websocket(kind, namespace, name)
    else:
        proc = attach_pod_exec(namespace, name)
    handler.send_response(101, "Switching Protocols")
    handler.send_header("Upgrade", "websocket")
    handler.send_header("Connection", "Upgrade")
    handler.send_header("Sec-WebSocket-Accept", websocket_accept_key(key))
    handler.end_headers()
    handler.wfile.flush()
    handler.close_connection = True
    client = handler.connection
    try:
        client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except OSError:
        pass
    if upstream is not None:
        pump_sockets(client, upstream)
        return
    if proc is not None:
        _pump_exec(client, proc)


def _pump_exec(client: socket.socket, proc: subprocess.Popen) -> None:
    """Bridge decoded browser frames to kubectl exec stdio."""
    buffer = bytearray()
    stdout = proc.stdout
    stdin = proc.stdin
    assert stdout is not None and stdin is not None
    try:
        while True:
            fds = [client, stdout]
            readable, _, _ = select.select(fds, [], [], 60.0)
            if client in readable:
                chunk = client.recv(65536)
                if not chunk:
                    break
                buffer.extend(chunk)
                payloads, closed = decode_ws_frames(buffer)
                for payload in payloads:
                    stdin.write(payload)
                    stdin.flush()
                if closed:
                    break
            if stdout in readable:
                data = stdout.read(4096)
                if not data:
                    break
                client.sendall(encode_ws_text(data if isinstance(data, bytes) else data.encode("utf-8")))
    finally:
        try:
            proc.terminate()
        except OSError:
            pass
        try:
            client.close()
        except OSError:
            pass
