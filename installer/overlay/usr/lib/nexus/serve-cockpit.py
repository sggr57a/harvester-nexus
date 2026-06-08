#!/usr/bin/env python3
"""Nexus cockpit static SPA server + thin Harvester metrics BFF."""

from __future__ import annotations

import http.server
import importlib.util
import json
import os
import socketserver
import ssl
import sys
import threading
from typing import Callable
from urllib.parse import urlparse

ROOT = os.environ.get("NEXUS_COCKPIT_ROOT", "/usr/share/nexus-cockpit/dist")
HTTP_PORT = int(os.environ.get("NEXUS_COCKPIT_HTTP_PORT", "8080"))
HTTPS_PORT = int(os.environ.get("NEXUS_COCKPIT_HTTPS_PORT", "8443"))
TLS_CRT = os.environ.get("NEXUS_COCKPIT_TLS_CRT", "/etc/nexus/tls/cockpit.crt")
TLS_KEY = os.environ.get("NEXUS_COCKPIT_TLS_KEY", "/etc/nexus/tls/cockpit.key")
METRICS_MODULE = os.path.join(os.path.dirname(__file__), "cluster_metrics.py")


def _load_metrics():
    spec = importlib.util.spec_from_file_location("nexus_cluster_metrics", METRICS_MODULE)
    if spec is None or spec.loader is None:
        raise ImportError("cluster_metrics module missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, metrics=None, **kwargs):
        self._metrics = metrics
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/healthz":
            self._plain(200, b"ok")
            return

        if path == "/api/v1/health/live":
            self._json_api(self._handle_live_health)
            return

        if path == "/api/v1/telemetry/environment":
            self._json_api(self._handle_environment)
            return

        requested = self.translate_path(self.path)
        if not os.path.exists(requested) or os.path.isdir(requested):
            self.path = "/index.html"
        return super().do_GET()

    def _plain(self, code: int, body: bytes, content_type: str = "text/plain") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json_api(self, handler: Callable[[], dict]) -> None:
        try:
            payload = handler()
            body = json.dumps(payload).encode("utf-8")
            self._plain(200, body, "application/json")
        except Exception as exc:  # noqa: BLE001
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self._plain(503, body, "application/json")

    def _handle_live_health(self) -> dict:
        if self._metrics is None:
            return {
                "live": False,
                "clusterReady": False,
                "monitoringEnabled": False,
                "message": "metrics collector unavailable",
            }
        return self._metrics.live_health()

    def _handle_environment(self) -> dict:
        if self._metrics is None:
            raise RuntimeError("metrics collector unavailable")
        return self._metrics.collect_environment()

    def log_message(self, fmt, *args):
        sys.stderr.write("[nexus-cockpit] %s - %s\n" % (self.address_string(), fmt % args))


def bind_server(port: int, metrics) -> socketserver.TCPServer:
    class ReuseTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    def handler(*args, **kwargs):
        SPAHandler(*args, metrics=metrics, **kwargs)

    try:
        return ReuseTCPServer(("0.0.0.0", port), handler)
    except OSError as exc:
        sys.stderr.write("nexus-cockpit: bind 0.0.0.0:%d failed: %s\n" % (port, exc))
        raise


def serve_http_background(metrics) -> None:
    try:
        with bind_server(HTTP_PORT, metrics) as httpd:
            httpd.serve_forever()
    except OSError:
        sys.stderr.write("nexus-cockpit: HTTP listener on %d unavailable\n" % HTTP_PORT)


def main() -> int:
    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        sys.stderr.write("missing cockpit bundle: %s/index.html\n" % ROOT)
        return 1

    try:
        metrics = _load_metrics()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("nexus-cockpit: metrics module disabled: %s\n" % exc)
        metrics = None

    if os.path.isfile(TLS_CRT) and os.path.isfile(TLS_KEY):
        threading.Thread(target=serve_http_background, args=(metrics,), daemon=True).start()
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=TLS_CRT, keyfile=TLS_KEY)
        try:
            with bind_server(HTTPS_PORT, metrics) as httpd:
                httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
                sys.stderr.write(
                    "nexus-cockpit listening on https://0.0.0.0:%d (http://0.0.0.0:%d)\n"
                    % (HTTPS_PORT, HTTP_PORT)
                )
                httpd.serve_forever()
        except OSError:
            return 1
    else:
        sys.stderr.write(
            "nexus-cockpit listening on http://0.0.0.0:%d (no TLS certs)\n" % HTTP_PORT
        )
        try:
            with bind_server(HTTP_PORT, metrics) as httpd:
                httpd.serve_forever()
        except OSError:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
