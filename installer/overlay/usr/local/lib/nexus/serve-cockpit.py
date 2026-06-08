#!/usr/bin/env python3
"""Minimal static SPA server for the Nexus cockpit (HTTP + optional HTTPS)."""

from __future__ import annotations

import http.server
import os
import socketserver
import ssl
import sys
import threading

ROOT = os.environ.get("NEXUS_COCKPIT_ROOT", "/usr/local/share/nexus-cockpit/dist")
HTTP_PORT = int(os.environ.get("NEXUS_COCKPIT_HTTP_PORT", "8080"))
HTTPS_PORT = int(os.environ.get("NEXUS_COCKPIT_HTTPS_PORT", "8443"))
TLS_CRT = os.environ.get("NEXUS_COCKPIT_TLS_CRT", "/etc/nexus/tls/cockpit.crt")
TLS_KEY = os.environ.get("NEXUS_COCKPIT_TLS_KEY", "/etc/nexus/tls/cockpit.key")


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path.rstrip("/") == "/healthz":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        requested = self.translate_path(self.path)
        if not os.path.exists(requested) or os.path.isdir(requested):
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("[nexus-cockpit] %s - %s\n" % (self.address_string(), fmt % args))


def bind_server(port: int) -> socketserver.TCPServer:
    class ReuseTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    return ReuseTCPServer(("0.0.0.0", port), SPAHandler)


def serve_http():
    with bind_server(HTTP_PORT) as httpd:
        httpd.serve_forever()


def main() -> int:
    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        sys.stderr.write("missing cockpit bundle: %s/index.html\n" % ROOT)
        return 1

    threading.Thread(target=serve_http, daemon=True).start()

    if os.path.isfile(TLS_CRT) and os.path.isfile(TLS_KEY):
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=TLS_CRT, keyfile=TLS_KEY)
        with bind_server(HTTPS_PORT) as httpd:
            httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
            sys.stderr.write(
                "nexus-cockpit listening on https://0.0.0.0:%d and http://0.0.0.0:%d\n"
                % (HTTPS_PORT, HTTP_PORT)
            )
            httpd.serve_forever()
    else:
        sys.stderr.write(
            "nexus-cockpit listening on http://0.0.0.0:%d (no TLS certs)\n" % HTTP_PORT
        )
        serve_http()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
