#!/usr/bin/env python3
"""Nexus cockpit static SPA server + thin Harvester metrics BFF."""

from __future__ import annotations

import hmac
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
BIND_ADDRESS = os.environ.get("NEXUS_COCKPIT_BIND", "0.0.0.0")
HTTP_PORT = int(os.environ.get("NEXUS_COCKPIT_HTTP_PORT", "8080"))
HTTPS_PORT = int(os.environ.get("NEXUS_COCKPIT_HTTPS_PORT", "8443"))
TLS_CRT = os.environ.get("NEXUS_COCKPIT_TLS_CRT", "/etc/nexus/tls/cockpit.crt")
TLS_KEY = os.environ.get("NEXUS_COCKPIT_TLS_KEY", "/etc/nexus/tls/cockpit.key")
METRICS_MODULE = os.path.join(os.path.dirname(__file__), "cluster_metrics.py")
DASHBOARDS_MODULE = os.path.join(os.path.dirname(__file__), "dashboard_collectors.py")
RESOURCES_MODULE = os.path.join(os.path.dirname(__file__), "cluster_resources.py")
OVS_MODULE = os.path.join(os.path.dirname(__file__), "ovs_operations.py")
AUTH_MODULE = os.path.join(os.path.dirname(__file__), "cockpit_auth.py")
ANYRAID_MODULE = os.path.join(os.path.dirname(__file__), "anyraid_provisioner.py")
CONSOLE_MODULE = os.path.join(os.path.dirname(__file__), "console_proxy.py")

# Endpoints reachable without a session. Everything else under /api/v1
# requires a valid bearer token or session cookie.
PUBLIC_PATHS = frozenset({"/healthz", "/api/v1/auth/login", "/api/v1/auth/session"})


def _load_module(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError("%s module missing" % name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_metrics():
    return _load_module(METRICS_MODULE, "nexus_cluster_metrics")


def _load_dashboards():
    return _load_module(DASHBOARDS_MODULE, "nexus_dashboard_collectors")


def _load_resources():
    return _load_module(RESOURCES_MODULE, "nexus_cluster_resources")


def _load_ovs():
    return _load_module(OVS_MODULE, "nexus_ovs_operations")


def _load_auth():
    return _load_module(AUTH_MODULE, "nexus_cockpit_auth")


def _load_anyraid():
    return _load_module(ANYRAID_MODULE, "nexus_anyraid_provisioner")


def _load_console():
    return _load_module(CONSOLE_MODULE, "nexus_console_proxy")


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(
        self,
        *args,
        metrics=None,
        dashboards=None,
        resources=None,
        ovs=None,
        auth=None,
        credentials=None,
        sessions=None,
        anyraid=None,
        console=None,
        tls_enabled=False,
        **kwargs,
    ):
        self._metrics = metrics
        self._dashboards = dashboards
        self._resources = resources
        self._ovs = ovs
        self._auth = auth
        self._credentials = credentials
        self._sessions = sessions
        self._anyraid = anyraid
        self._console = console
        self._tls_enabled = tls_enabled
        self._pending_cookie = None
        self._clear_cookie = False
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---------------- authentication ----------------

    def _session_token(self) -> str | None:
        if self._auth is None:
            return None
        token = self._auth.parse_bearer_token(self.headers.get("Authorization"))
        if token:
            return token
        return self._auth.parse_session_cookie(self.headers.get("Cookie"))

    def _authenticated_user(self) -> str | None:
        if self._sessions is None:
            return None
        return self._sessions.validate(self._session_token())

    def _require_auth(self) -> bool:
        """Send 401 and return False when the caller has no valid session."""
        if self._authenticated_user() is not None:
            return True
        body = json.dumps({"error": "authentication required"}).encode("utf-8")
        self.send_response(401)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("WWW-Authenticate", 'Bearer realm="nexus-cockpit"')
        self.end_headers()
        self.wfile.write(body)
        return False

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/healthz":
            self._plain(200, b"ok")
            return

        if path == "/api/v1/auth/session":
            self._json_api(self._handle_session_info)
            return

        if path.startswith("/api/v1/"):
            if path not in PUBLIC_PATHS and not self._require_auth():
                return

        if path.startswith("/api/v1/console/") and self._console is not None:
            if self._console.is_websocket_request(self.headers):
                self._handle_console_upgrade(path)
                return

        if path == "/api/v1/health/live":
            self._json_api(self._handle_live_health)
            return

        if path == "/api/v1/telemetry/environment":
            self._json_api(self._handle_environment)
            return

        if path == "/api/v1/telemetry/dashboards":
            self._json_api(self._handle_dashboards)
            return

        if path == "/api/v1/storage/anyraid":
            self._json_api(self._handle_anyraid_status)
            return

        if path == "/api/v1/telemetry/memory-tiering":
            self._json_api(self._handle_memory_tiering)
            return

        if path == "/api/v1/telemetry/accelerators":
            self._json_api(self._handle_accelerators)
            return

        if path.startswith("/api/v1/"):
            self._plain(404, b"not found")
            return

        requested = self.translate_path(self.path)
        if not os.path.exists(requested) or os.path.isdir(requested):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/v1/auth/login":
            self._json_api(self._handle_login)
            return

        if path == "/api/v1/auth/logout":
            self._json_api(self._handle_logout)
            return

        if path.startswith("/api/v1/") and path not in PUBLIC_PATHS:
            if not self._require_auth():
                return

        if path == "/api/v1/auth/password":
            self._json_api(self._handle_change_password)
            return

        if path == "/api/v1/resources/apply":
            self._json_api(self._handle_apply_manifest)
            return

        if path == "/api/v1/networking/ovs":
            self._json_api(self._handle_ovs_apply)
            return

        if path == "/api/v1/machines/attach-network":
            self._json_api(self._handle_attach_network)
            return

        self._plain(404, b"not found")

    def _plain(
        self,
        code: int,
        body: bytes,
        content_type: str = "text/plain",
        extra_headers: list[tuple[str, str]] | None = None,
    ) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        for name, value in extra_headers or []:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _session_cookie_headers(self) -> list[tuple[str, str]]:
        """Emit Set-Cookie for a login/logout that just happened."""
        secure = "; Secure" if self._tls_enabled else ""
        token = getattr(self, "_pending_cookie", None)
        if token:
            self._pending_cookie = None
            return [
                (
                    "Set-Cookie",
                    "nexus_session=%s; Path=/; HttpOnly; SameSite=Strict%s" % (token, secure),
                )
            ]
        if getattr(self, "_clear_cookie", False):
            self._clear_cookie = False
            return [
                (
                    "Set-Cookie",
                    "nexus_session=; Path=/; HttpOnly; SameSite=Strict%s; Max-Age=0" % secure,
                )
            ]
        return []

    def _json_api(self, handler: Callable[[], dict]) -> None:
        try:
            payload = handler()
            body = json.dumps(payload).encode("utf-8")
            self._plain(200, body, "application/json", self._session_cookie_headers())
        except ValueError as exc:
            body = json.dumps({"success": False, "error": str(exc)}).encode("utf-8")
            self._plain(400, body, "application/json")
        except Exception as exc:  # noqa: BLE001
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self._plain(503, body, "application/json")

    def _handle_session_info(self) -> dict:
        """Unauthenticated: lets the SPA discover whether a backend is present."""
        record = self._credentials.load() if self._credentials else None
        user = self._authenticated_user()
        return {
            "backend": True,
            "authenticated": user is not None,
            "username": user,
            "mustChangePassword": bool((record or {}).get("mustChangePassword")),
        }

    def _handle_login(self) -> dict:
        if self._auth is None or self._credentials is None or self._sessions is None:
            return {"success": False, "error": "authentication unavailable"}
        body = self._read_json_body()
        username = str(body.get("username") or "").strip()
        password = str(body.get("password") or "")
        if not username or not password:
            return {"success": False, "error": "username and password required"}

        if self._sessions.locked_out(username):
            return {"success": False, "error": "too many failed attempts; try again later"}

        record = self._credentials.load()
        if not record or not isinstance(record.get("credential"), dict):
            return {"success": False, "error": "no credentials provisioned on this node"}

        expected_user = str(record.get("username") or "admin")
        # Compare both factors before returning so a wrong username and a wrong
        # password cost the same amount of work.
        user_ok = hmac.compare_digest(username, expected_user)
        password_ok = self._auth.verify_password(password, record["credential"])
        if not (user_ok and password_ok):
            self._sessions.record_failure(username)
            return {"success": False, "error": "invalid credentials"}

        self._sessions.clear_failures(username)
        session = self._sessions.create(expected_user)
        self._pending_cookie = session["token"]
        return {
            "success": True,
            "error": None,
            "username": expected_user,
            "token": session["token"],
            "expiresInSeconds": session["expiresInSeconds"],
            "mustChangePassword": bool(record.get("mustChangePassword")),
        }

    def _handle_logout(self) -> dict:
        if self._sessions is not None:
            self._sessions.revoke(self._session_token())
        self._clear_cookie = True
        return {"success": True, "error": None}

    def _handle_change_password(self) -> dict:
        if self._auth is None or self._credentials is None or self._sessions is None:
            return {"success": False, "error": "authentication unavailable"}
        body = self._read_json_body()
        current = str(body.get("currentPassword") or "")
        new = str(body.get("newPassword") or "")
        if len(new) < 12:
            return {"success": False, "error": "new password must be at least 12 characters"}

        record = self._credentials.load() or {}
        credential = record.get("credential")
        if not isinstance(credential, dict) or not self._auth.verify_password(current, credential):
            return {"success": False, "error": "current password is incorrect"}

        username = str(record.get("username") or "admin")
        self._credentials.set_password(username, new, must_change=False)
        # Rotating the password invalidates every existing session, including
        # this one, so a leaked token cannot outlive the credential change.
        self._sessions.revoke_all()
        self._clear_cookie = True
        return {"success": True, "error": None, "reauthenticationRequired": True}

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

    def _handle_dashboards(self) -> dict:
        if self._dashboards is None:
            raise RuntimeError("dashboard collector unavailable")
        return self._dashboards.collect_dashboards_live()

    def _handle_anyraid_status(self) -> dict:
        """Real AnyRAID pool state from LVM on this node."""
        if self._anyraid is None:
            return {"exists": False, "error": "AnyRAID provisioner unavailable"}
        return self._anyraid.pool_status()

    def _handle_memory_tiering(self) -> dict:
        if self._dashboards is None:
            return {"available": False, "error": "dashboard collector unavailable"}
        collector = getattr(self._dashboards, "_collect_processor_memory", None)
        if collector is None:
            return {"available": False, "error": "memory tiering collector unavailable"}
        return collector()

    def _handle_accelerators(self) -> dict:
        if self._dashboards is None:
            return {"available": False, "error": "dashboard collector unavailable"}
        collector = getattr(self._dashboards, "_collect_acceleration", None)
        if collector is None:
            return {"available": False, "error": "accelerator collector unavailable"}
        return collector()

    def _handle_console_upgrade(self, path: str) -> None:
        if self._console is None:
            self._plain(503, b"console proxy unavailable")
            return
        try:
            kind, namespace, name = self._console.parse_console_request(path)
            self._console.handle_browser_upgrade(self, kind, namespace, name)
        except ValueError as exc:
            self._plain(400, str(exc).encode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            if not self.wfile.closed:
                try:
                    self._plain(503, str(exc).encode("utf-8"))
                except Exception:  # noqa: BLE001
                    return

    def _handle_apply_manifest(self) -> dict:
        if self._resources is None:
            raise RuntimeError("resource apply unavailable")
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            return {"success": False, "error": "invalid JSON: %s" % exc, "output": ""}
        manifest = body.get("manifest") or ""
        dry_run = bool(body.get("dryRun"))
        return self._resources.apply_manifest_yaml(manifest, dry_run=dry_run)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("invalid JSON: %s" % exc) from exc

    def _handle_ovs_apply(self) -> dict:
        if self._ovs is None:
            return {"success": False, "error": "OVS module unavailable", "output": ""}
        body = self._read_json_body()
        commands = body.get("commands") or []
        if not isinstance(commands, list):
            return {"success": False, "error": "commands must be an array", "output": ""}
        return self._ovs.run_ovs_commands([str(c) for c in commands])

    def _handle_attach_network(self) -> dict:
        if self._resources is None:
            return {"success": False, "error": "resource apply unavailable", "output": ""}
        body = self._read_json_body()
        return self._resources.attach_workload_network(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("[nexus-cockpit] %s - %s\n" % (self.address_string(), fmt % args))


class ReuseThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class HttpsRedirectHandler(http.server.BaseHTTPRequestHandler):
    """Plaintext listener used only to bounce callers to HTTPS.

    Serving the API over plaintext alongside TLS would let a session token
    travel in the clear, so when certificates are present the HTTP port
    redirects instead of handling requests.
    """

    def _redirect(self) -> None:
        host = (self.headers.get("Host") or "").split(":")[0] or "localhost"
        target = "https://%s:%d%s" % (host, HTTPS_PORT, self.path)
        self.send_response(308)
        self.send_header("Location", target)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    do_GET = _redirect
    do_POST = _redirect
    do_HEAD = _redirect

    def log_message(self, fmt, *args):
        return


def bind_server(port: int, services: dict, tls_enabled: bool) -> socketserver.TCPServer:
    def handler(*args, **kwargs):
        SPAHandler(*args, tls_enabled=tls_enabled, **services, **kwargs)

    try:
        return ReuseThreadingTCPServer((BIND_ADDRESS, port), handler)
    except OSError as exc:
        sys.stderr.write("nexus-cockpit: bind %s:%d failed: %s\n" % (BIND_ADDRESS, port, exc))
        raise


def serve_redirect_background() -> None:
    try:
        with ReuseThreadingTCPServer((BIND_ADDRESS, HTTP_PORT), HttpsRedirectHandler) as httpd:
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

    try:
        dashboards = _load_dashboards()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("nexus-cockpit: dashboard collector disabled: %s\n" % exc)
        dashboards = None

    try:
        resources = _load_resources()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("nexus-cockpit: resource apply disabled: %s\n" % exc)
        resources = None

    try:
        ovs = _load_ovs()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("nexus-cockpit: OVS module disabled: %s\n" % exc)
        ovs = None

    try:
        anyraid = _load_anyraid()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("nexus-cockpit: AnyRAID provisioner disabled: %s\n" % exc)
        anyraid = None

    try:
        console = _load_console()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("nexus-cockpit: console proxy disabled: %s\n" % exc)
        console = None

    # Authentication is mandatory: every /api/v1 route other than login and
    # session discovery mutates or exposes cluster state, so the cockpit
    # refuses to serve at all if the credential store cannot be initialised.
    try:
        auth = _load_auth()
        credentials = auth.CredentialStore()
        record, generated = auth.ensure_credential_store(credentials)
        sessions = auth.SessionManager()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("nexus-cockpit: FATAL: authentication unavailable: %s\n" % exc)
        return 1

    if generated:
        sys.stderr.write(
            "nexus-cockpit: generated initial admin password (also written to %s):\n"
            "nexus-cockpit:   %s\n"
            "nexus-cockpit: change it on first login.\n" % (auth.PASSWORD_HANDOFF_FILE, generated)
        )
    elif record.get("mustChangePassword"):
        sys.stderr.write("nexus-cockpit: admin password is flagged for rotation on next login\n")

    services = {
        "metrics": metrics,
        "dashboards": dashboards,
        "resources": resources,
        "ovs": ovs,
        "auth": auth,
        "credentials": credentials,
        "sessions": sessions,
        "anyraid": anyraid,
        "console": console,
    }

    if os.path.isfile(TLS_CRT) and os.path.isfile(TLS_KEY):
        threading.Thread(target=serve_redirect_background, daemon=True).start()
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(certfile=TLS_CRT, keyfile=TLS_KEY)
        try:
            with bind_server(HTTPS_PORT, services, tls_enabled=True) as httpd:
                httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
                sys.stderr.write(
                    "nexus-cockpit listening on https://%s:%d (http://%s:%d redirects)\n"
                    % (BIND_ADDRESS, HTTPS_PORT, BIND_ADDRESS, HTTP_PORT)
                )
                httpd.serve_forever()
        except OSError:
            return 1
    else:
        sys.stderr.write(
            "nexus-cockpit listening on http://%s:%d (no TLS certs — sessions are "
            "unencrypted in transit; provision %s and %s)\n"
            % (BIND_ADDRESS, HTTP_PORT, TLS_CRT, TLS_KEY)
        )
        try:
            with bind_server(HTTP_PORT, services, tls_enabled=False) as httpd:
                httpd.serve_forever()
        except OSError:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
